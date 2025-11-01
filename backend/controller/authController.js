import ErrorHandler, { errorMiddleware } from "../middlewares/errorMiddleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js"
import bcrypt from "bcrypt"
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { generateEmailTemplate } from "../utils/forgotPassEmailTemp.js";
import { sendEmail } from "../utils/sendEmail.js";

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

export const getUser = catchAsyncError(async(req,res,next)=> {
    const {user} = req;
    res.status(200).json({
        success : true,
        user,
    });
});

export const logout = catchAsyncError(async(req,res,next)=> {
    res.status(200).cookie("token","",{
        expires: new Date(Date.now()),
        httpOnly:true,
    }).json({
        success:true,
        message:"Logged Out Succesfully.",
    })
})

export const forgotPassword = catchAsyncError(async(req,res,next)=>{
    const {email} = req.body;
    const {frontendUrl} = req.query;
    let userResult = await database.query(
        `SELECT * FROM users where email = $1`, [email]
    );
    if(userResult.rows.length===0){
        return next(new ErrorHandler("User not found with this email.",404));
    }
    const user = userResult.rows[0];
    const { resetToken, hashedToken, resetPasswordExpireTime } = generateResetPasswordToken();
    
    await database.query(
        `UPDATE  users SET reset_password_token = $1, reset_password_expire = to_timestamp($2) WHERE email=$3`,
        [hashedToken, resetPasswordExpireTime / 1000, email]
    );

    const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`;
    const message = generateEmailTemplate(resetPasswordUrl);

    try {
        await sendEmail({
            email: user.email,
            subject: "Ecommerce password recovery",
            message,
        });
        res.status(200).json({
            success:true,
            message:`Email sent to ${user.email} successfully`
        })
    } catch (error) {
        await database.query(`
            UPDATE users SET reset_password_token=NULL, reset_password_expire=NULL WHERE email = $1`,
            [email]
        );
        return next(new ErrorHandler("Email could not be send", 500));
    }
})