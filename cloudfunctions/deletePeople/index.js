const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { id } = event
  
  try {
    // 获取当前用户OpenID
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 验证当前用户是否是管理员
    const user = await db.collection('people').where({
      _openid: openid,
      role: 'admin'
    }).get()
    
    if (user.data.length === 0) {
      // 如果不是管理员，检查是否是超级管理员或特殊权限用户
      // 这里可以添加其他权限验证逻辑
      return { success: false, error: '无权限操作' }
    }
    
    // 执行删除操作
    const result = await db.collection('people').doc(id).remove()
    
    return { success: true, data: result }
  } catch (error) {
    console.error('删除人员失败:', error)
    return { success: false, error: error.message }
  }
}