import { apiClient } from '@/lib/api-client';

export type BlogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** List/card shape — no body, so listings stay small. */
export interface BlogCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  tags: string[];
  readingMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string | null;
}

export interface BlogPost extends BlogCard {
  content: string;
  status: BlogStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  viewCount: number;
  createdAt: string;
}

export type BlogPostDetail = BlogPost & { related: BlogCard[] };

export interface BlogList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface BlogPostInput {
  title?: string;
  summary?: string;
  content?: string;
  slug?: string;
  status?: BlogStatus;
  coverImageUrl?: string;
  coverImageAlt?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

export const blogApi = {
  list: (page = 1, tag?: string) =>
    apiClient.get<BlogList<BlogCard>>(
      `/blog?page=${page}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`,
    ),
  detail: (slug: string) => apiClient.get<BlogPostDetail>(`/blog/${slug}`),
};

/** Admin authoring. Separate from blogApi so the public reader stays minimal. */
export const adminBlogApi = {
  list: (page = 1, status?: BlogStatus) =>
    apiClient.get<BlogList<BlogPost>>(
      `/admin/blog?page=${page}${status ? `&status=${status}` : ''}`,
    ),
  get: (id: string) => apiClient.get<BlogPost>(`/admin/blog/${id}`),
  create: (body: BlogPostInput) => apiClient.post<BlogPost>('/admin/blog', body),
  update: (id: string, body: BlogPostInput) => apiClient.patch<BlogPost>(`/admin/blog/${id}`, body),
  remove: (id: string) => apiClient.delete<{ deleted: boolean }>(`/admin/blog/${id}`),
};
