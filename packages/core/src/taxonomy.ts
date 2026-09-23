import { z } from 'zod';
import { DisplayTextSchema, TagIdSchema } from './ids.js';

// Artists have their own IDs; these are field names, never a closed list of tag values.
export const TaxonomyDimensionSchema = z.enum([
  'genres',
  'languages',
  'regions',
  'eras',
  'cultures',
  'franchises',
  'scenes',
]);
export const TaxonomyTagSchema = z
  .strictObject({
    id: TagIdSchema,
    dimension: TaxonomyDimensionSchema,
    label: DisplayTextSchema,
    parentId: TagIdSchema.optional(),
  })
  .readonly();
export const TaxonomySchema = z
  .array(TaxonomyTagSchema)
  .superRefine((tags, context) => {
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    if (byId.size !== tags.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate tag ID' });
    }
    for (const [index, tag] of tags.entries()) {
      if (tag.parentId !== undefined) {
        const parent = byId.get(tag.parentId);
        if (!parent || parent.dimension !== tag.dimension) {
          context.addIssue({
            code: 'custom',
            path: [index, 'parentId'],
            message: 'Parent must exist in the same dimension',
          });
        }
      }
      const visited = new Set<string>([tag.id]);
      let parentId = tag.parentId;
      while (parentId !== undefined) {
        if (visited.has(parentId)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'parentId'],
            message: 'Taxonomy cycle',
          });
          break;
        }
        visited.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }
  })
  .readonly();
export type TaxonomyDimension = z.infer<typeof TaxonomyDimensionSchema>;
export type TaxonomyTag = z.infer<typeof TaxonomyTagSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;
