import ErrorHandler, { errorMiddleware } from "../middlewares/errorMiddleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js"
import bcrypt from "bcrypt"
import { sendToken } from "../utils/jwtToken.js";

export const register = catchAsyncError(async(req,res,next)=> {
    const {name, email, password } = req.body;
    if(!name || !email || !password){
        return next(new ErrorHandler("Please provide all required Fields", 400));
    }
    const isAlreadyRegistered = await database.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );

    if(isAlreadyRegistered.rows.length > 0){
        return next(new ErrorHandler("User already  registered with this email", 400));
    }

    const hashPassword = await bcrypt.hash(password, 10)
    const user = await database.query('INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING *',
        [name, email, hashPassword]
    );

    sendToken(user.rows[0],201,"User registered Successfully", res)
    
})

export const login = catchAsyncError(async(req,res,next)=> {
    const {email, password} = req.body;
    if(!email || !password){
        return next(new ErrorHandler("please provide email & password", 400));
    }
    const user = await database.query('SELECT * FROM users WHERE email = $1', [email]);
    if(user.rows.length===0){
        return next(new ErrorHandler("Invalid User or Password. Try Again", 401));
    }

    const isPasswordMatch = await  bcrypt.compare(password, user.rows[0].password)
    if(!isPasswordMatch){
        return next(new ErrorHandler("Invalid User or Password. Try Again", 401))
    }
    sendToken(user.rows[0],200,"Logged in Successfully", res)
})

export const getUser = catchAsyncError(async(req,res,next)=> {})

export const logout = catchAsyncError(async(req,res,next)=> {})