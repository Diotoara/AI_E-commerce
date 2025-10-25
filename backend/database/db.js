import pkg from"pg"
const { Client } = pkg;

// const database = new Client(process.env.DB_URL)
const database = new Client("postgresql://neondb_owner:npg_HioWgvys3Le5@ep-silent-scene-adorjyx6-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

try {
    await database.connect();
    console.log("connected to database")
} catch (error) {
    console.log("Dtbse connection failed "+error.errors)
    process.exit(1)
}

export default database