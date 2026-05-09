/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the RSS parser and other Node-only modules to run in API routes
  serverExternalPackages: ['rss-parser'],
}

module.exports = nextConfig
