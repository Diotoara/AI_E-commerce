import express, { Router } from "express"
import { getUser, login, logout, register } from "../controller/authController.js"
import { isAuthenticated } from "../middlewares/authMiddleware.js"
const router = express.Router()

router.post("/register", register)
router.post("/login", login)
router.get("/logout", isAuthenticated , logout)
router.get("/me", isAuthenticated , getUser)

export default router