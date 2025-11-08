import ErrorHandler, { errorMiddleware } from "../middlewares/errorMiddleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js"
import bcrypt from "bcrypt"
import crypto from "crypto"
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { generateEmailTemplate } from "../utils/forgotPassEmailTemp.js";
import { sendEmail } from "../utils/sendEmail.js";
import { v2 as cloudinary } from 'cloudinary'


export const register = catchAsyncError(async(req,res,next)=> {
    const {name, email, password } = req.body;
    if(!name || !email || !password){
        return next(new ErrorHandler("Please provide all required Fields", 400));
    }


    if(password<8 || password>16) {
        return next(new ErrorHandler("Password must be between 8 and 16 characters.", 400));
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

export const resetPassword = catchAsyncError(async(req,res,next)=>{
    const {token} = req.params;
    const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex")
    const user = await database.query("SELECT * FROM  users WHERE reset_password_token = $1 AND reset_password_expire > NOW()",
        [resetPasswordToken]
    );
    if(user.rows.length === 0){
        return next(new ErrorHandler("Invalid or expired reset token.",400));
    }
    if(req.body.password !== req.body.confirmPassword){
        return next(new ErrorHandler())
    }
    if(req.body.password?.length<8 ||
        req.body.password?.length>16 ||
        req.body.confirmPasswor?.lengthd<8 ||
        req.body.confirmPassword?.length>16
    ) {
        return next(new ErrorHandler("Password must be between 8 and 16 characters.", 400));
    }
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const updatedUser = await database.query(
        `UPDATE users SET PASSWORD = $1, reset_password_token = NULL, reset_password_expire = NULL where id=$2 RETURNING *`,
        [hashedPassword, user.rows[0].id]
    );
    sendToken(updatedUser.rows[0],220, "Password reset successfully", res);
})

export const updatePassword = catchAsyncError(async(req,res,next)=>{
    const {currentPassword, newPassword, confirmNewPassword} = req.body
    if(!currentPassword || !newPassword || !confirmNewPassword){
        return next(new ErrorHandler("Please provide all required fields", 400))
    }
    const isPasswordMatch = await bcrypt.compare(currentPassword, req.user.password);
    if(!isPasswordMatch){
        return next(new ErrorHandler("Current password is incorrect", 400))
    }
    if(newPassword !== confirmNewPassword){
        return next(new ErrorHandler("New passwords do not match", 400))
    }

    if(newPassword.length<8 ||
        newPassword.length>16
    ) {
        return next(new ErrorHandler("Password must be between 8 and 16 characters.", 400));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await database.query("UPDATE users SET password = $1 where id=$2", [hashedPassword, req.user.id]);

    res.status(200).json({
        success : true,
        message : "password updated successfully.",
    });
});

export const updateProfile = catchAsyncError(async (req,res,next)=>{
    const { name,email } = req.body;
    if(!name || !email){
        return next(new ErrorHandler("Please provide all required fields", 400));
    }
    if(name.trim().length === 0 || email.trim().length === 0 ){
        return next(new ErrorHandler("Name and Email can not be empty", 400));
    }
    let avatarData = {};
    if(req.files && req.files.avatar){
        const {avatar} = req.files;
        if(req.user?.avatar?.public_id){
            await cloudinary.uploader.destroy(req.user.avatar.public_id);
        }
        const newProfileImage = await cloudinary.uploader.upload(avatar.tempFilePath,{
            folder:"Ecommerce_avatars",
            width:150,
            crop:"scale",
        })
        avatarData={
            public_id : newProfileImage.public_id,
            url : newProfileImage.secure_url,
        }
    }
    let user;
    if(Object.keys(avatarData).length === 0){
        user = await database.query(
            `UPDATE users SET name = $1, email=$2 WHERE id=$3 RETURNING *`,
            [name,email, req.user.id]
        )
    } else{
        user = await database.query(
            "UPDATE users SET name=$1, email=$2, avatar=$3 WHERE id=$4 RETURNING *",
            [name, email, avatarData, req.user.id]
        )
    }

    res.status(200).json({
        success : true,
        message:"Profile updated Succesfully",
        user : user.rows[0]
    })

})