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
    
    // 获取要删除的轮播图信息
    const banner = await db.collection('banners').doc(id).get()
    if (!banner.data) {
      return { success: false, error: '轮播图不存在' }
    }
    
    // 删除云存储中的图片文件
    if (banner.data.image) {
      try {
        await cloud.deleteFile({
          fileList: [banner.data.image]
        })
      } catch (fileErr) {
        console.error('删除云文件失败:', fileErr)
        // 继续删除数据库记录，不中断操作
      }
    }
    
    // 执行删除操作
    const result = await db.collection('banners').doc(id).remove()
    
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}