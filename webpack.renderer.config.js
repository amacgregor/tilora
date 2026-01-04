const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Main renderer config
const mainRendererConfig = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './src/renderer/index.ts',
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
    }),
  ],
};

// Overlay renderer config
const overlayRendererConfig = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './src/renderer/overlay.ts',
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  output: {
    filename: 'overlay.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/overlay.html',
      filename: 'overlay.html',
      inject: false, // We manually include the script
    }),
  ],
};

module.exports = [mainRendererConfig, overlayRendererConfig];
