import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { NextFunction, Request, Response } from "express";


export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    (req as any).session = session;
    next();
}
export default isAuthenticated;