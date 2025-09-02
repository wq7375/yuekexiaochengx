App({
  onLaunch: function () {
    wx.cloud.init({env: 'xly-3gf7enpg7be21056',  // 替换为实际环境 ID
    traceUser: true,});
  }
});
