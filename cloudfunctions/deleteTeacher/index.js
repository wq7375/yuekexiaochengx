const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { id } = event
  
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
    
    // 获取要删除的教师信息
    const teacher = await db.collection('teachers').doc(id).get()
    if (!teacher.data) {
      return { success: false, error: '教师不存在' }
    }
    
    // 删除云存储中的头像和视频文件
    const fileList = []
    if (teacher.data.avatar) fileList.push(teacher.data.avatar)
    if (teacher.data.video) fileList.push(teacher.data.video)
    
    if (fileList.length > 0) {
      try {
        await cloud.deleteFile({
          fileList: fileList
        })
      } catch (fileErr) {
        console.error('删除云文件失败:', fileErr)
        // 继续删除数据库记录，不中断操作
      }
    }
    
    // 执行删除操作
    const result = await db.collection('teachers').doc(id).remove()
    
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}