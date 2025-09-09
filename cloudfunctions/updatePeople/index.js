const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { id, data } = event
  
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
    
    // 检查姓名和手机号是否已存在（排除当前记录）
    const duplicateCheck = await db.collection('people')
      .where({
        name: data.name,
        phone: data.phone,
        _id: db.command.neq(id) // 排除当前记录
      })
      .get()
    
    if (duplicateCheck.data.length > 0) {
      return { 
        success: false, 
        error: `已存在相同姓名和手机号的${duplicateCheck.data[0].role === 'admin' ? '管理员' : '学员'}：${duplicateCheck.data[0].name}` 
      }
    }
    
    // 添加更新时间戳
    const updateData = {
      ...data,
      updateTime: db.serverDate()
    }
    
    // 执行更新操作
    const result = await db.collection('people').doc(id).update({
      data: updateData
    })
    
    return { success: true, data: result }
  } catch (error) {
    console.error('更新人员失败:', error)
    return { success: false, error: error.message }
  }
}