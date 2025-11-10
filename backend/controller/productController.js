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
        LEFT JOIN reviews r ON p.id = r.product_id
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
        LEFT JOIN reviews r ON p.id = r.product_id
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
        LEFT JOIN reviews r ON p.id = r.product_id
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
        newProductsQuery: newProductsResult.rows,
        topRatedProducts: topRatedResult.rows,
    })

});

export const updateProduct = catchAsyncError(async(req,res,next) => {
    const {productId} = req.params;
    const {name, description, price, category, stock } = req.body;

    if(!name || !description || !price || !category || !stock){
        return next(new ErrorHandler("Please provide all required fields",400));
    }
    const product = await database.query(
        `SELECT * FROM products WHERE id = $1`,
        [productId]
    );
    if(product.rows.length === 0){
        return next(new ErrorHandler("Product not found",404));
    }
    const result = await database.query(
        `UPDATE products SET name=$1, description=$2, price=$3, category=$4, stock=$5 WHERE id=$6 RETURNING *`,
        [name, description, price/87, category, stock, productId]
    );
    res.status(200).json({
        success: true,
        message: "Product updated successfully",
        updateProduct: result.rows[0],
    });

}); 

export const deleteProduct = catchAsyncError(async(req,res,next) => {
    const {productId} = req.params;

    const product = await database.query(
        `SELECT * FROM products WHERE id = $1`,
        [productId]
    );  
    if(product.rows.length === 0){
        return next(new ErrorHandler("Product not found",404));
    }
    const images = product.rows[0].images;
    const deleteResult = await database.query(
        `DELETE FROM products WHERE id = $1 RETURNING *`,
        [productId]
    );
    if(deleteResult.rows.length === 0){
        return next(new ErrorHandler("Failed to delete product",500));
    }

    //delete from cloudinary
    if(images && images.length > 0){
        for(const image of images){
            await cloudinary.uploader.destroy(image.public_id);
        }
    }

    res.status(200).json({
        success: true,
        message: "Product deleted successfully",
    });

});

export const fetchSingleProduct = catchAsyncError(async(req,res,next) => {
    const {productId} = req.params;
    const result = await database.query(
        `SELECT p.*,
        COALESCE(
        json_agg(
        json_build_object(
        'review_id', r.id,
        'rating', r.rating,
        'comment', r.comment,
        'reviewer', json_build_object(
            'id', u.id,
            'name', u.name,
            'avatar', u.avatar
            )
        )
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reviews
            FROM products p
            LEFT JOIN reviews r ON p.id = r.product_id
            LEFT JOIN users u ON r.user_id = u.id
            WHERE p.id = $1
            GROUP BY p.id`,
        [productId]
    );

    res.status(200).json({
        success: true,
        message: "Product fetched successfully",
        product: result.rows[0],
    });
});

export const postProductReview = catchAsyncError(async(req,res,next) => {
    const {productId} = req.params;
    const {rating, comment} = req.body;
    const userId = req.user.id;

    if(!rating || !comment){
        return next(new ErrorHandler("Please provide rating and comment",400));
    }

    const purchaseCheckQuery = `
        SELECT oi.product_id
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN payments p ON p.order_id = o.id 
        WHERE o.buyer_id = $1 AND oi.product_id = $2 AND p.payment_status = 'Paid'
        LIMIT 1
    `;

    const {rows} = await database.query(purchaseCheckQuery, [userId, productId]);

    if(rows.length === 0){
        return res.status(403).json({
            success: false,
            message: "You can only review products you have purchased.",
        });
    }

    const product = await database.query(
        `SELECT * FROM products WHERE id = $1`,
        [productId]
    );

    if(product.rows.length === 0){
        return next(new ErrorHandler("Product not found",404));
    }

    const isAlreadyReviewed = await database.query(
        `SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2`,
        [productId, userId]
    );

    let review;
    if(isAlreadyReviewed.rows.length > 0){
        review = await database.query(
            `UPDATE reviews SET rating=$1, comment=$2 WHERE product_id=$3 AND user_id=$4 RETURNING *`,
            [rating, comment, productId, userId]
        );
    } else{
        review = await database.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *`,
            [productId, userId, rating, comment]
        );
    }

    const allReviews = await database.query(
        `SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = $1`,
        [productId]
    );

    const newAvgRating = allReviews.rows[0].avg_rating;

    const updatedProduct = await database.query(
        `UPDATE products SET ratings=$1 WHERE id=$2 RETURNING *`,
        [newAvgRating, productId]
    );

    res.status(200).json({
        success: true,
        message: "Review submitted successfully",
        review: review.rows[0],
        updatedProduct: updatedProduct.rows[0],
    });

});

export const deleteReview = catchAsyncError(async(req,res,next) => {
    const {productId} = req.params;

    const review = await database.query(
        `DELETE FROM reviews WHERE product_id = $1 AND user_id = $2 RETURNING *`,
        [productId, req.user.id]
    );

    if(review.rows.length === 0){
        return next(new ErrorHandler("Review not found",404));
    }

    const allReviews = await database.query(
        `SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = $1`,
        [productId]
    );

    const newAvgRating = allReviews.rows[0].avg_rating;

    const updatedProduct = await database.query(
        `UPDATE products SET ratings=$1 WHERE id=$2 RETURNING *`,
        [newAvgRating, productId]
    );

    res.status(200).json({
        success: true,
        message: "Your Review has been deleted successfully",
        review: review.rows[0],
        prorduct: updatedProduct.rows[0],
    });

});