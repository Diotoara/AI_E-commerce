import { createOrderItemTable } from "../models/orderItemsTable.js"
import { createOrdersTable } from "../models/orderTable.js"
import { createPaymentTable } from "../models/paymentsTable.js"
import { createProductReviewTable } from "../models/productsReviewTable.js"
import { createProductTable } from "../models/productsTable.js"
import { createShippingInfoTable } from "../models/shippingInfoTable.js"
import { createUserTable } from "../models/userTable.js"

export async function createTables(){
    try {
        console.log("started")
        await createUserTable()
        console.log("done 1")
        await createProductTable()
        console.log("done 2")
        await createProductReviewTable()
        console.log("done 3")
        await createOrdersTable()
        console.log("done 4")
        await createOrderItemTable()
        console.log("done 5")
        await createShippingInfoTable()
        console.log("done 6")
        await createPaymentTable()
        console.log("all table created successfully")
    } catch (error) {
        console.log("Error in creating tables" + error)
        process.exit(1)
        
    }
}