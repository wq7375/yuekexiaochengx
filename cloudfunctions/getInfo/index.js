// 云函数：getInfo
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  openid = wxContext.OPENID;

  // 查是否已有当前 openid
  var logging = 'none';
  // logging = 'Searching by openid: \n'+wxContext.OPENID+'\n';//日志，可删
  const existRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (existRes.data.length > 0) {
    const user = existRes.data[0]
    // logging = logging+'user found:\nrole is: '+user.role+'\nid is: '+user._id+'\n';//日志，可删
    // 删去id和openid后返回用户的信息
    const {_id,_openid, ...newUser} = user;
    return newUser;
  } else {
    wx.showToast({ title: '未登录或未注册！', icon: 'none' });
    return;
  }
}
