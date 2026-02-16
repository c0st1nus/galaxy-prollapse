module.exports = {
  apps: [
    {
      name: "backend",
      cwd: "./backend",
      script: "bun",
      args: "./dist/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "web",
      cwd: "./web",
      script: "bun",
      args: "./build/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
  ],
};
