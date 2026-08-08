import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BlogStatus } from '@prisma/client';

export class CreateBlogPostDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: 'Teaser for cards and, by default, the meta description.' })
  @IsString()
  @MinLength(20, { message: 'A summary of at least 20 characters helps search results' })
  @MaxLength(500)
  summary!: string;

  @ApiProperty({ description: 'Markdown. Rendered escaped-first, so raw HTML is never executed.' })
  @IsString()
  @MinLength(50)
  content!: string;

  @ApiPropertyOptional({ description: 'Left blank, it is generated from the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug may contain lowercase letters, numbers and single hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional({ enum: BlogStatus, default: BlogStatus.DRAFT })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsUrl({ require_protocol: true }, { message: 'Cover image must be a full https URL' })
  @MaxLength(1024)
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Alt text — required whenever a cover image is set.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImageAlt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Overrides the <title>. Falls back to the post title.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'Overrides the meta description. Falls back to the summary.' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;
}

/**
 * Everything optional — the editor saves one section at a time. The slug is
 * accepted here but the service refuses to change it once a post is published.
 */
export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto) {}

export class BlogListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 12;
}

/** Admin listing can also see drafts and archived posts. */
export class AdminBlogListQueryDto extends BlogListQueryDto {
  @ApiPropertyOptional({ enum: BlogStatus })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;
}
