const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  const { cloudPath, fileID } = event
  
  try {
    // 验证当前用户是否是管理员
    const wxContext = cloud.getWXContext()
    const user = await db.collection('people').where({
      _openid: wxContext.OPENID,
      role: 'admin'
    }).get()
    
    if (user.data.length === 0) {
      // 删除已上传的图片，因为没有权限
      await cloud.deleteFile({
        fileList: [fileID]
      })
      return { success: false, error: '无权限操作' }
    }
    
    // 添加轮播图记录
    const result = await db.collection('banners').add({
      data: {
        image: fileID,
        createdAt: db.serverDate()
      }
    })
    
    return { success: true, data: result }
  } catch (error) {
    // 删除已上传的图片，因为操作失败
    await cloud.deleteFile({
      fileList: [fileID]
    })
    return { success: false, error: error.message }
  }
}