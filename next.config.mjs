/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  },
  images: {
    domains: ["firebasestorage.googleapis.com"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        http2: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        stream: false,
        util: false,
        url: false,
        crypto: false,
      };
    }

    // Xử lý undici trong @firebase/auth
    config.module.rules.push({
      test: /[\\/]node_modules[\\/](@firebase[\\/]auth|undici)[\\/].*\.js$/,
      use: {
        loader: "babel-loader",
        options: {
          presets: ["@babel/preset-env"],
          plugins: [
            "@babel/plugin-proposal-private-methods",
            "@babel/plugin-proposal-class-properties",
          ],
        },
      },
    });

    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ["undici", "@firebase/auth"],
  },
  reactStrictMode: true,
};

export default nextConfig;
