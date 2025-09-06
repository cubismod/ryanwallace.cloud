const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

const isProd = process.env.NODE_ENV === 'production'

function tryRequire(name) {
  try {
    return require(name)
  } catch (_e) {
    return null
  }
}

const MomentLocalesPlugin = tryRequire('moment-locales-webpack-plugin')
const MomentTimezoneDataPlugin = tryRequire(
  'moment-timezone-data-webpack-plugin'
)

/** @type {import('webpack').Configuration} */
const appConfig = {
  entry: {
    map: path.resolve(__dirname, 'src/map.ts'),
    track: path.resolve(__dirname, 'src/track.ts'),
    alerts: path.resolve(__dirname, 'src/alerts-page.ts')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    publicPath: '/map/'
  },
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? false : 'eval-source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      // Map only the bare 'leaflet' import to JS file; leave CSS path intact
      leaflet$: 'leaflet/dist/leaflet.js'
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              sourceMap: !isProd
            }
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          isProd ? MiniCssExtractPlugin.loader : 'style-loader',
          'css-loader'
        ]
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/index.html'),
      filename: 'index.html',
      chunks: ['map'],
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/track.html'),
      filename: 'track.html',
      chunks: ['track'],
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/alerts.html'),
      filename: 'alerts.html',
      chunks: ['alerts'],
      inject: 'body'
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
      'window.jQuery': 'jquery'
    }),
    new webpack.EnvironmentPlugin({
      NODE_ENV: isProd ? 'production' : 'development',
      MT_KEY: process.env.MT_KEY || '',
      VEHICLES_URL: '',
      MBTA_API_BASE: '',
      TRACK_PREDICTION_API: ''
    }),
    new MiniCssExtractPlugin({ filename: '[name].css' }),
    ...(MomentLocalesPlugin
      ? [new MomentLocalesPlugin({ localesToKeep: [] })]
      : []),
    ...(MomentTimezoneDataPlugin
      ? [
          new MomentTimezoneDataPlugin({
            matchZones: 'America/New_York',
            startYear: 2020,
            endYear: 2035
          })
        ]
      : [])
  ],
  target: 'web',
  optimization: {
    splitChunks: {
      chunks: 'all',
      name: false,
      maxSize: 150000,
      cacheGroups: {
        leaflet: {
          test: /[\\/]node_modules[\\/](leaflet)[\\/]/,
          name: 'leaflet',
          chunks: 'all',
          priority: 20
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all',
          priority: 10
        }
      }
    },
    runtimeChunk: false,
    minimize: isProd,
    minimizer: isProd
      ? [
          new TerserPlugin({
            extractComments: false,
            parallel: true,
            terserOptions: {
              ecma: 2020,
              compress: {
                drop_console: true,
                drop_debugger: true,
                pure_getters: true,
                passes: 2,
                dead_code: true,
                comparisons: true,
                inline: 2
              },
              mangle: true,
              format: { comments: false }
            }
          }),
          new CssMinimizerPlugin()
        ]
      : []
  }
}

/** @type {import('webpack').Configuration} */
const swConfig = {
  entry: {
    sw: path.resolve(__dirname, 'src/sw.ts')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: false,
    publicPath: '/map/'
  },
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? false : 'eval-source-map',
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              sourceMap: !isProd
            }
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  target: 'web',
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
    minimize: isProd,
    minimizer: isProd
      ? [
          new TerserPlugin({
            extractComments: false,
            parallel: true,
            terserOptions: {
              ecma: 2020,
              compress: {
                drop_console: true,
                drop_debugger: true,
                pure_getters: true,
                passes: 2,
                dead_code: true,
                comparisons: true,
                inline: 2
              },
              mangle: true,
              format: { comments: false }
            }
          })
        ]
      : []
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: isProd ? 'production' : 'development',
      MT_KEY: process.env.MT_KEY || '',
      VEHICLES_URL: '',
      MBTA_API_BASE: '',
      TRACK_PREDICTION_API: ''
    })
  ]
}

module.exports = [appConfig, swConfig]
