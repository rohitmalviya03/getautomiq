import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BlogPost, BlogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import {
  AdminBlogListQueryDto,
  BlogListQueryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from './dto/blog.dto';

/** Average adult reading speed; good enough for a "5 min read" badge. */
const WORDS_PER_MINUTE = 200;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 191);
}

function readingMinutesOf(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

const authorSelect = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Public ---------------------------------------------------------------

  /** Published posts, newest first. Drafts are never reachable from here. */
  async listPublished(query: BlogListQueryDto) {
    const { page, pageSize, tag } = query;
    const where: Prisma.BlogPostWhereInput = {
      status: BlogStatus.PUBLISHED,
      deletedAt: null,
      publishedAt: { not: null, lte: new Date() },
      // Tags are a JSON string; a quoted substring match avoids "ai" matching "email".
      ...(tag ? { tags: { contains: `"${tag}"` } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { author: authorSelect },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      items: rows.map((p) => this.toCard(p)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * A published post by slug. The view counter is best-effort — a failed
   * increment must never stop the article rendering.
   */
  async getPublishedBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        status: BlogStatus.PUBLISHED,
        deletedAt: null,
        publishedAt: { not: null, lte: new Date() },
      },
      include: { author: authorSelect },
    });
    if (!post) throw new NotFoundException('Post not found');

    void this.prisma.blogPost
      .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    // Three more posts to read next, never including this one.
    const related = await this.prisma.blogPost.findMany({
      where: {
        id: { not: post.id },
        status: BlogStatus.PUBLISHED,
        deletedAt: null,
        publishedAt: { not: null, lte: new Date() },
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      include: { author: authorSelect },
    });

    return { ...this.toFull(post), related: related.map((p) => this.toCard(p)) };
  }

  /** Slugs + timestamps for the sitemap. */
  async listPublishedSlugs() {
    const rows = await this.prisma.blogPost.findMany({
      where: { status: BlogStatus.PUBLISHED, deletedAt: null, publishedAt: { not: null } },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString().slice(0, 10) }));
  }

  // ---- Admin ----------------------------------------------------------------

  async listForAdmin(query: AdminBlogListQueryDto) {
    const { page, pageSize, status } = query;
    const where: Prisma.BlogPostWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { author: authorSelect },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      items: rows.map((p) => ({ ...this.toCard(p), status: p.status, viewCount: p.viewCount })),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /** Any post by id, draft or not — the editor needs the raw Markdown. */
  async getForAdmin(id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      include: { author: authorSelect },
    });
    if (!post) throw new NotFoundException('Post not found');
    return this.toFull(post);
  }

  async create(dto: CreateBlogPostDto, actor: AuthenticatedUser) {
    this.assertCoverHasAlt(dto);
    const slug = await this.uniqueSlug(dto.slug?.trim() || slugify(dto.title));
    const status = dto.status ?? BlogStatus.DRAFT;

    const post = await this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        content: dto.content,
        status,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        coverImageAlt: dto.coverImageAlt?.trim() || null,
        tags: JSON.stringify(dto.tags ?? []),
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
        readingMinutes: readingMinutesOf(dto.content),
        authorUserId: actor.id,
        // Publishing on create stamps the date now; a draft has none until it goes live.
        publishedAt: status === BlogStatus.PUBLISHED ? new Date() : null,
      },
      include: { author: authorSelect },
    });
    return this.toFull(post);
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Post not found');
    this.assertCoverHasAlt({ ...existing, ...dto });

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.content !== undefined) {
      data.content = dto.content;
      data.readingMinutes = readingMinutesOf(dto.content);
    }
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl.trim() || null;
    if (dto.coverImageAlt !== undefined) data.coverImageAlt = dto.coverImageAlt.trim() || null;
    if (dto.tags !== undefined) data.tags = JSON.stringify(dto.tags);
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle.trim() || null;
    if (dto.seoDescription !== undefined) data.seoDescription = dto.seoDescription.trim() || null;

    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      // Once a post is live its URL is load-bearing: inbound links and whatever
      // ranking it has earned are attached to that slug.
      if (existing.status === BlogStatus.PUBLISHED) {
        throw new BadRequestException(
          'The URL of a published post cannot be changed — it would break inbound links.',
        );
      }
      data.slug = await this.uniqueSlug(dto.slug, id);
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      // Stamp publishedAt the first time it goes live; keep the original date on
      // any later re-publish so the post doesn't look newer than it is.
      if (dto.status === BlogStatus.PUBLISHED && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data,
      include: { author: authorSelect },
    });
    return this.toFull(post);
  }

  /** Soft delete: keeps the row so the slug stays taken and history is intact. */
  async remove(id: string) {
    const existing = await this.prisma.blogPost.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Post not found');
    await this.prisma.blogPost.update({
      where: { id },
      data: { deletedAt: new Date(), status: BlogStatus.ARCHIVED },
    });
    return { deleted: true };
  }

  // ---- helpers --------------------------------------------------------------

  private assertCoverHasAlt(post: { coverImageUrl?: string | null; coverImageAlt?: string | null }) {
    if (post.coverImageUrl?.trim() && !post.coverImageAlt?.trim()) {
      throw new BadRequestException('Add alt text describing the cover image.');
    }
  }

  /** Appends -2, -3 … until free. `ignoreId` lets a post keep its own slug. */
  private async uniqueSlug(base: string, ignoreId?: string): Promise<string> {
    const root = slugify(base);
    if (!root) throw new ConflictException('Could not build a URL from that title.');

    for (let n = 1; n < 50; n += 1) {
      const candidate = n === 1 ? root : `${root}-${n}`;
      const clash = await this.prisma.blogPost.findUnique({ where: { slug: candidate } });
      if (!clash || clash.id === ignoreId) return candidate;
    }
    throw new ConflictException('Too many posts with a similar title — pick a custom URL.');
  }

  /** List/card shape — no body, so listings stay small. */
  private toCard(post: BlogPost & { author?: { firstName: string; lastName: string } | null }) {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      coverImageUrl: post.coverImageUrl,
      coverImageAlt: post.coverImageAlt,
      tags: parseTags(post.tags),
      readingMinutes: post.readingMinutes,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      authorName: post.author ? `${post.author.firstName} ${post.author.lastName}`.trim() : null,
    };
  }

  private toFull(post: BlogPost & { author?: { firstName: string; lastName: string } | null }) {
    return {
      ...this.toCard(post),
      content: post.content,
      status: post.status,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      viewCount: post.viewCount,
      createdAt: post.createdAt,
    };
  }
}
