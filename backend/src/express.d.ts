declare global {
  namespace Express {
    interface Request {
      session?: {
        session: {
          id: string;
          createdAt: Date;
          updatedAt: Date;
          userId: string;
          expiresAt: Date;
          token: string;
          ipAddress?: string | null;
          userAgent?: string | null;
        };
        user: {
          id: string;
          name?: string | null;
          email: string;
          emailVerified: boolean;
          image?: string | null;
          createdAt: Date;
          updatedAt: Date;
        };
      } | null;
    }
  }
}
