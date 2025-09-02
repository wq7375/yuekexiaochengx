// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  // 获取微信上下文，其中包含 OPENID、APPID
  const wxContext = cloud.getWXContext()
  // 返回 OpenID 和 AppID
  return {
    openid: wxContext.OPENID, // 使用此方法获取OPENID
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID, // 如果不在同一开放平台下，可能为空
  }
}