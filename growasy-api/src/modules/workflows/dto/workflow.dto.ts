import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { WorkflowNodeType } from '@prisma/client';

export class CreateWorkflowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Instagram account this workflow runs on' })
  @IsString()
  instagramAccountId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;
}

export class WorkflowNodeInput {
  @ApiProperty({ description: 'Client-generated UUID; stable across saves' })
  @IsString()
  id!: string;

  @ApiProperty({ enum: WorkflowNodeType })
  @IsEnum(WorkflowNodeType)
  type!: WorkflowNodeType;

  @ApiPropertyOptional({ description: 'Node-type-specific config object' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsInt()
  positionX!: number;

  @IsInt()
  positionY!: number;
}

export class WorkflowEdgeInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  sourceNodeId!: string;

  @IsString()
  targetNodeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceHandle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/** Full replace of the workflow's node/edge graph — the canvas "Save". */
export class SaveGraphDto {
  @ApiProperty({ type: [WorkflowNodeInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeInput)
  nodes!: WorkflowNodeInput[];

  @ApiProperty({ type: [WorkflowEdgeInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeInput)
  edges!: WorkflowEdgeInput[];
}
