const dotenv = require("fs")
    .readFileSync("./backend/.env", "utf-8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .reduce((acc, line) => {
        const [key, ...rest] = line.split("=");
        acc[key.trim()] = rest.join("=").trim();
        return acc;
    }, {});

module.exports = {
    apps: [
        {
            name: "backend",
            cwd: "./backend",
            script: "bun",
            args: "./dist/index.js",
            env: dotenv,
        },
        {
            name: "web",
            cwd: "./web",
            script: "bun",
            args: "./build/index.js",
            env: {
                NODE_ENV: "production",
                PORT: 9128,
            },
        },
    ],
};
