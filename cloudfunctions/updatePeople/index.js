const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { id, data } = event
  
  try {
    // 验证当前用户是否是管理员
    const wxContext = cloud.getWXContext()
    const user = await db.collection('people').where({
      _openid: wxContext.OPENID,
      role: 'admin'
    }).get()
    
    if (user.data.length === 0) {
      return { success: false, error: '无权限操作' }
    }
    
    // 执行更新操作
    const result = await db.collection('people').doc(id).update({
      data: data
    })
    
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}