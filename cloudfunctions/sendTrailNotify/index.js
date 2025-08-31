const cloud = require('wx-server-sdk')
cloud.init()

// 管理者OpenID（建议从数据库/环境变量获取）
const adminOpenId = '管理员的openid' // <-- 替换为你的管理员openid

exports.main = async (event, context) => {
  const { name, mobile, date, remark } = event

  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: adminOpenId,
      templateId: '订阅消息模板ID', // <-- 替换为你自己的订阅消息模板ID
      miniprogramState: 'developer', // 'developer'/'trial'/'formal'
      data: {
        name1: { value: name },
        tel2: { value: mobile },
        date3: { value: date },
        thing4: { value: remark || '无' },
      }
    })
    return { success: true, result }
  } catch (e) {
    return { success: false, error: e }
  }
}