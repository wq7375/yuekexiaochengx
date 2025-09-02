// 云函数 login
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { name='注意！程序可能有漏洞', phone = '请联系开发者！'} = event

  // 先查是否已有当前 openid
  const userRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (userRes.data.length > 0) {
    return { role: userRes.data[0].role, openid: userRes.data[0]._openid }
  }

  // 查是否已有任何用户
  const allRes = await db.collection('people').get()

  if (allRes.data.length === 0) {
    // 第一个用户 → 管理员
    await db.collection('people').add({
      data: {
        name,
        phone,
        role: 'admin',
        _openid: wxContext.OPENID,
        cards: []
      }
    })
    return { role: 'admin' }
  }

  // 按电话+姓名匹配
  const matchRes = await db.collection('people').where({
    name,
    phone
  }).get()

  if (matchRes.data.length > 0) {
    // 更新 openid
    await db.collection('people').doc(matchRes.data[0]._id).update({
      data: { _openid: wxContext.OPENID }
    })
    return { role: matchRes.data[0].role }
  }

  // 没匹配到
  return { role: 'none' }
}
