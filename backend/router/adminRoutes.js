import express from 'express';
import { dashboardStats, deleteUser, getAllUsers } from  "../controller/adminController.js"
import { isAuthenticated, authorizedRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get("/getallusers", isAuthenticated, authorizedRoles("Admin"), getAllUsers);  //DASHBOARD ONLy
router.delete("/delete/:id", isAuthenticated, authorizedRoles("Admin"), deleteUser);  //DASHBOARD ONLy
router.get("/fetch/dashboard-stats", isAuthenticated, authorizedRoles("Admin"), dashboardStats);  //DASHBOARD ONLy

export default router;