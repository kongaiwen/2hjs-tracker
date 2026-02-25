/**
 * Error Handler Middleware
 *
 * Catches and formats errors consistently across the API.
 */

import { Context, Next, MiddlewareHandler } from 'hono';

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);

    // Handle different error types
    if (error instanceof Error) {
      // Prisma-like errors
      if ('code' in error) {
        const prismaError = error as { code: string; meta?: { target?: string[] } };

        switch (prismaError.code) {
          case 'P2002':
            return c.json({
              error: 'Conflict',
              message: `A record with this ${prismaError.meta?.target?.join(', ') || 'value'} already exists`,
            }, 409);
          case 'P2025':
            return c.json({
              error: 'Not found',
              message: 'Record not found',
            }, 404);
        }
      }

      // Validation errors
      if (error.name === 'ValidationError') {
        return c.json({
          error: 'Validation error',
          message: error.message,
        }, 400);
      }

      // Generic error
      return c.json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
      }, 500);
    }

    return c.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
    }, 500);
  }
};
