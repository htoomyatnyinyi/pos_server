// middlewares/validation.ts
import { Elysia, t } from "elysia";

export const validateMiddleware = (schema: any) =>
  new Elysia().onBeforeHandle(async ({ body, query, params, set }) => {
    try {
      // Validate body
      if (schema.body) {
        await t.Object(schema.body).validate(body);
      }
      // Validate query
      if (schema.query) {
        await t.Object(schema.query).validate(query);
      }
      // Validate params
      if (schema.params) {
        await t.Object(schema.params).validate(params);
      }
    } catch (error) {
      set.status = 400;
      throw new Error(`Validation error: ${error.message}`);
    }
  });
