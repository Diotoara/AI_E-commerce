import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import {v2 as cloudinary} from "cloudinary";
import database from "../database/db.js";

export const createProduct =  catchAsyncError(async(req,res,next) => {
    const { name, description, price, category, stock } = req.body;
    const created_by=req.user.id;

    if(!name || !description || !price || !category || !stock){
        return next(new ErrorHandler("Please provide all required fields",400));
    }

    let uploadedImages = [];
    if(req.files && req.files.images){
        const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
        for(const image of images){
            const result = await cloudinary.uploader.upload(image.tempFilePath,{
                folder:"Ecommerce_products_images",
                width: 1000,
                crop: "scale",
            })

            uploadedImages.push({
                url:result.secure_url,
                public_id: result.public_id,
            });
        }
    }

    const product  = await database.query(
        `INSERT INTO products (name, description, price, category, stock, images, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, description, price/87, category, stock, JSON.stringify(uploadedImages), created_by]
    );

    res.status(201).json({
        success: true,
        message: "product created successfully",
        product: product.rows[0],
    });

})

export const fetchAllProducts = catchAsyncError(async(req,res,next) => {
    const{ availablity, price, category, rating, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit; 

    const conditions = [];
    let values = [];
    let index = 1;

    let paginationPlaceholder = {};

    // Availability Filter 
    if(availablity === "in-stock"){
        conditions.push(`stock > 5`);
    } else if(availablity === "limited"){
        conditions.push(`stock > 0 AND stock<= 5`);
    } else if(availablity === "out-of-stock"){
        conditions.push(`stock = 0`);
    }

    // Price Filter
    if(price){
        const[minPrice, maxPrice] = price.split("-");
        if(minPrice&&maxPrice){
            conditions.push(`price BETWEEN $${index} AND $${index + 1}`);
            values.push(minPrice/87, maxPrice/87);
            index += 2;
        }
    }

    // Category Filter
    if(category){
        conditions.push(`category ILIKE $${index}`);
        values.push(`%${category}%`);
        index += 1;
        
    }

    // Rating Filter
    if(rating){
        conditions.push(`ratings >= $${index}`);
        values.push(rating);
        index += 1;
    }

    //search Filter
    if(search){
        conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`);
        values.push(`%${search}%`);
        index += 1;
    }

    const whereClause = conditions.length ? `WHERE ` + conditions.join(' AND ') : '';

    //get count of filtered products
    const totalProductResult = await database.query(
        `SELECT COUNT(*) FROM products p ${whereClause}`,
        values
    );
    const totalProducts = parseInt(totalProductResult.rows[0].count);

    paginationPlaceholder.limit = `$${index}`;
    values.push(limit);
    index += 1;
    paginationPlaceholder.offset = `$${index}`;
    values.push(offset);
    index += 1;

    //FETCH with reviews
    const query = `
        SELECT p.*, 
        COUNT(r.id) AS review_count 
        FROM products p 
        LEFT JOIN review r ON p.id = r.product_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT ${paginationPlaceholder.limit} 
        OFFSET ${paginationPlaceholder.offset}
    `;

    const result = await database.query(
        query,
        values
    );

    //query for fetching new Products
    const newProductsQuery = `
        SELECT p.*,
        COUNT(r.id) AS review_count
        FROM products p
        LEFT JOIN review r ON p.id = r.product_id
        WHERE p.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 8
    `;
    const newProductsResult = await database.query(newProductsQuery);

    //query for fetching TOP RATED Products
    const topRatedQuery = `
        SELECT p.*,
        COUNT(r.id) AS review_count
        FROM products p
        LEFT JOIN review r ON p.id = r.product_id
        WHERE p.ratings >= 4.5
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 8
    `;
    const topRatedResult = await database.query(topRatedQuery);

    res.status(200).json({
        success: true,
        products: result.rows,
        totalProducts,
        newProductsQuery 
    })

});