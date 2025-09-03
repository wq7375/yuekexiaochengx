// 云函数：login
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { name, phone } = event

  // 查是否已有当前 openid
  const existRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (existRes.data.length > 0) {
    const user = existRes.data[0]
    return { role: user.role, id: user._id }
  }

  // 查是否已有任何用户
  const allRes = await db.collection('people').get()
  if (allRes.data.length === 0) {
    // 第一个用户 → 管理员
    const addRes = await db.collection('people').add({
      data: {
        name,
        phone,
        role: 'admin',
        _openid: wxContext.OPENID,
        cards: []
      }
    })
    return { role: 'admin', id: addRes._id }
  }

  // 按姓名+电话匹配
  const matchRes = await db.collection('people').where({
    name,
    phone
  }).get()

  if (matchRes.data.length > 0) {
    // 更新 openid
    await db.collection('people').doc(matchRes.data[0]._id).update({
      data: { _openid: wxContext.OPENID }
    })
    return { role: matchRes.data[0].role, id: matchRes.data[0]._id }
  }

  // 没匹配到
  return { role: 'none' }
}

