const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

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
    track: path.resolve(__dirname, 'src/track.ts')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    publicPath: '/map/'
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
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
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    },
    runtimeChunk: 'single'
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
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: false,
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
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  target: 'web',
  optimization: {
    splitChunks: false,
    runtimeChunk: false
  }
}

module.exports = [appConfig, swConfig]
