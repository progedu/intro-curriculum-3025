// 厳格モード
'use strict';
// jadeモジュール呼び出し
const jade = require('jade');
// cookiesモジュール呼び出し
// 利用する際に、個別のオブジェクトを生成する必要があるモジュールについては頭文字を大文字にしているようだ
const Cookies = require('cookies');
// 自作のhandler-utilモジュール呼び出し
const util = require('./handler-util');
// 自作のpostモジュール呼び出し
const Post = require('./post');
// ハッシュとして登録するcookie値のキーとする文字列
const trackingIdKey = 'tracking_id';
/**
 * 投稿などの処理を行う関数
 * @param {IncomingMessage} req 
 * @param {ServerResponse} res 
 */
function handle(req, res) {
  // 個別のCookie情報(Cookiesオブジェクト)を生成する 
  const cookies = new Cookies(req, res);
  // 生成したCookiesオブジェクトにCookie値などのデータを設定する
  addTrackingCookie(cookies);
  // リクエスト情報に含まれるHTTPメソッドによって処理を分岐する
  switch (req.method) {
    // 'GET'メソッドでアクセスされた場合
    case 'GET':
      // レスポンスヘッダにステータスコードとその他の情報を書き出す
      res.writeHead(
        // ステータスコード200は成功
        200, {
          // Content-Typeとして'text/html; charset=utf-8'を設定する
          'Content-Type': 'text/html; charset=utf-8'
        });
      /** 
       * すべての投稿内容を取得する
       * 第一引数：投稿内容の取得に関するオプションデータのオブジェクト
      */
      let posts = Post.findAll(
        // idの降順で取得するように指定する（最新の投稿から取得する）
        { order: 'id DESC' }
      );
      /**
       * レスポンスとしてHTML形式で投稿内容を書き出す関数
       * @param {*} ps 
       */
      let renderFunc = function (ps) {
        /**
         * 改行コードを<br>タグに置き換える関数
         * @param {Bluebird<Any>} p 
         */
        let replaceNToBRFunc = function(p){
          p.content = p.content.replace(/\n/g, '<br>');
        }
        // 投稿を１件ずつ取り出して改行を<br>タグに置き換える
        ps.forEach(replaceNToBRFunc);
        /** 
         * jadeテンプレートを適用して投稿情報をHTMLに書き換える
         * 第一引数：jadeファイルのURL
         * 第二引数：変数情報のオブジェクト
        */
        let html = jade.renderFile('./views/posts.jade',
          // jadeテンプレート内のpostsにはこのjsファイルのpsを、userにはreq.userを値として与える
          {
            posts: ps,
            user: req.user
          });
        // HTMLを書き出して終了
        res.end(html);
        // 標準出力に閲覧ユーザー情報を出力する
        console.info(
          // ユーザー名
          `閲覧されました: user: ${req.user}, ` +
          // Cookie値
          `trackinId: ${cookies.get(trackingIdKey)},` +
          // IPアドレス
          `remoteAddress: ${req.connection.remoteAddress}, ` +
          // User-Agent
          `userAgent: ${req.headers['user-agent']} `
        );
      };
      // postsが正常に取得できていればrenderFunc関数を実行する
      posts.then(renderFunc);
      break;
    // 'POST'メソッドでアクセスされた場合
    case 'POST':
      // 新しい投稿情報を格納する配列（リクエストが細切れで送られてくることがあるため配列にする）
      let body = [];
      /**
       * 'data'イベント発生時（データを受け取った時）に実行する関数
       * 第一引数：送られてきた文字列
       * @param {string} chunk 
       */
      let dataFunc = function (chunk) {
        // 送られてきた文字列を配列に格納する
        body.push(chunk);
      };
      // 'data'イベントのイベントハンドラを登録する
      req.on('data', dataFunc);
      /** 
       * 'end'イベント発生時（すべてのデータを受け取り終わった時）に実行する関数
      */
      let endFunc = function () {
        // body配列に格納されている文字列を結合する
        body = Buffer.concat(body).toString();
        // 文字列はURIエンコードされているのでデコードしてやる
        const decoded = decodeURIComponent(body);
        // decodedは'content=XXXXX'という形式になっているので内容の部分だけ取得する
        const content = decoded.split('content=')[1];
        // 標準出力に新しく投稿された内容を出力する
        console.info('投稿されました: ' + content);
        /**
         * Postモデルを作成する(Sequelizeモジュールを利用してDBにも反映する)
         * 第一引数：作成するModelデータのオブジェクト
         */
        let post = Post.create({
          // 投稿内容
          content: content,
          // Cookie値
          trackingCookie: cookies.get(trackingIdKey),
          // ユーザー名
          postedBy: req.user
        });
        /** 
         * リダイレクト処理を行う関数
        */
        let redirectPostsFunc = function () {
          // リダイレクト
          handleRedirectPosts(req, res);
        }
        // Postモデルが生成できればリダイレクトする
        post.then(redirectPostsFunc);
      };
      // 'end'イベントのイベントハンドラを登録する
      req.on('end', endFunc);
      break;
    // 'GET''POST'以外のメソッドでアクセスされた場合
    default:
      // handler-utilモジュールでBad Request処理を行う
      util.handleBadRequest(req, res);
      break;
  }
}
/**
 * 投稿の削除処理を行う関数
 * @param {IncomingMessage} req 
 * @param {ServerResponse} res 
 */
function handleDelete(req, res) {
  // リクエスト情報に含まれるHTTPメソッドによって処理を分岐する
  switch (req.method) {
    // 'POST'メソッドでアクセスされた場合
    case 'POST':
      // body配列に格納されている文字列を結合する
      let body = [];
      /**
       * 'data'イベント発生時（データを受け取った時）に実行する関数
       * 第一引数：送られてきた文字列
       * @param {string} chunk 
       */
      let dataFunc = function (chunk) {
        // 送られてきた文字列を配列に格納する
        body.push(chunk);
      };
      // 'data'イベントのイベントハンドラを登録する
      req.on('data', dataFunc);
      /** 
       * 'end'イベント発生時（すべてのデータを受け取り終わった時）に実行する関数
      */
     let endFunc = function () {
        // body配列に格納されている文字列を結合する
        body = Buffer.concat(body).toString();
        // 文字列はURIエンコードされているのでデコードしてやる
        const decoded = decodeURIComponent(body);
        // decodedは'id=XXXXX'という形式になっているのでIDの部分だけ取得する
        const id = decoded.split('id=')[1];
        /** 
         * 削除したい投稿を特定する
         * 第一引数：主キー
        */
        let post = Post.findById(id);
        /**
         * 投稿を削除する関数
         * @param {Bluebird<any>} p 
         */
        let deleteFunc = function(p){
          // リクエスト情報に含まれるユーザー名と投稿したユーザー名が一致した場合
          if (req.user === p.postedBy || req.user === 'admin') {
            // 投稿を削除する(DBにも反映する)
            p.destroy();
            // 標準出力にログを書き込む
            console.info(
              // ユーザー名
              `削除されました: user: ${req.user}, ` +
              // IPアドレス
              `remoteAddress: ${req.connection.remoteAddress}, ` +
              // User-Agent
              `userAgent: ${req.headers['user-agent']} `
            );
          }
          // リダイレクトする
          handleRedirectPosts(req, res);
        }
        // 投稿を特定できたら削除処理を行う
        post.then(deleteFunc);
      }
      // 'end'イベントのイベントハンドラを登録する
      req.on('end', endFunc);
      break;
    // 'POST'以外のメソッドでアクセスされた場合
    default:
      // handler-utilモジュールでBad Request処理を行う
      util.handleBadRequest(req, res);
      break;
  }
}
/**
 * cookiesオブジェクトにcookie情報をセットする
 * @param {Cookies} cookies 
 */
function addTrackingCookie(cookies) {
  // cookiesオブジェクトがcookie値を持っていない場合
  if (!cookies.get(trackingIdKey)) {
    // Cookie値とするランダムな整数値
    const trackingId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    // Cookie値の有効期限を１日後にする
    const tomorrow = new Date(new Date().getTime() + (1000 * 60 * 60 * 24));
    // 
    /**
     * cookiesオブジェクトにCookie値と有効期限を設定する
     * 第一引数：ハッシュとして登録するCookie値のキーとして使用する文字列
     * 第二引数：Cookie値
     * 第三引数：Cookie情報のオプション
     */
    cookies.set(trackingIdKey, trackingId,
      // expires: 有効期限
      { expires: tomorrow });
  }
}
/**
 * /postsへリダイレクト処理を行う
 * @param {IncomingMessage} req 
 * @param {ServerResponse} res 
 */
function handleRedirectPosts(req, res) {
  // レスポンスヘッダにステータスコードとその他の情報を書き出す
  // 303はSee Otherをあらわす　URLが間違っていない場合は302じゃなくてこっちを使う
  res.writeHead(303, {
    // リダイレクト先を設定
    'Location': '/posts'
  });
  // 書き出し終了
  res.end();
}
// このモジュールに関数を登録する
module.exports = {
  handle: handle,
  handleDelete: handleDelete
};
