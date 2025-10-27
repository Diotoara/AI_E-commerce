import jwt from "jsonwebtoken"
import { catchAsyncError } from "./catchAsyncError"
import ErrorHandler from "./errorMiddleware"
import database from "../database/db"

export const isAuthenticated = catchAsyncError(async(req,res,next)=>{
    const {token} = req.cookies;
    if(!token){
        return next(new ErrorHandler("Please login to access this page.", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const user = await database.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [decoded.id]);
    
    req.user = user.rows[0];
    next();
})

export const authorizedRoles = (...roles) => {
    return (req,res,next) => {
        if(!roles.includes(req.user.role)){
            return next(
                new ErrorHandler(
                    `Role : ${req.user.role} is not allowed to access this resource`, 403
                )
            )
        }
        next()
    }
}