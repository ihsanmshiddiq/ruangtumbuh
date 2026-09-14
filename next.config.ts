import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Indikator dev (tombol melayang "N") menutupi item navigasi bawah paling
  // kiri di mobile — dimatikan agar preview tidak terhalang.
  devIndicators: false,
};

export default nextConfig;
