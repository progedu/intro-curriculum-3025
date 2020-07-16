'use strict';
const Sequelize = require('sequelize');    // sequelizeをインポート
const sequelize = new Sequelize(    // sequelizeのオブジェクトを作成
  'postgres://postgres:postgres@localhost/secret_board',
  {
    logging: false
  });
const Post = sequelize.define('Post', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  content: {
    type: Sequelize.TEXT
  },
  postedBy: {
    type: Sequelize.STRING
  },
  trackingCookie: {
    type: Sequelize.STRING
  }
}, {
    freezeTableName: true,
    timestamps: true
  });

Post.sync();
module.exports = Post;