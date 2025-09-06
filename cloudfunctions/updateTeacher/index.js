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
    
    // 准备更新数据，确保不包含系统字段
    const updateData = {}
    
    // 只添加前端传递的有效字段
    if (data.avatar !== undefined) updateData.avatar = data.avatar
    if (data.name !== undefined) updateData.name = data.name
    if (data.intro !== undefined) updateData.intro = data.intro
    if (data.skills !== undefined) updateData.skills = data.skills
    if (data.video !== undefined) updateData.video = data.video
    
    // 添加更新时间
    updateData.updateTime = db.serverDate()
    
    // 检查是否有有效字段需要更新
    if (Object.keys(updateData).length === 0) {
      return { success: false, error: '没有有效数据需要更新' }
    }
    
    // 执行更新操作
    const result = await db.collection('teachers').doc(id).update({
      data: updateData
    })
    
    return { success: true, data: result }
  } catch (error) {
    console.error('更新教师信息错误:', error)
    return { success: false, error: error.message }
  }
}