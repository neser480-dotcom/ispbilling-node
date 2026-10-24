const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
    host: "127.0.0.1",
    user: "root",
    password: "",
    database: "ispbilling",
    port: 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    charset: "utf8mb4"
});

module.exports = db;