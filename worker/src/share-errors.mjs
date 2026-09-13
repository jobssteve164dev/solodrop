const english = {
  '请选择要分享的文件。':'Choose a file to share.',
  '分享有效期无效，请选择 1、7 或 30 天。':'Choose a valid link lifetime: 1, 7, or 30 days.',
  'Free 分享保留 1 天；升级 Pro 可选择 7 或 30 天。':'Free links last 24 hours. Upgrade to Pro for 7 or 30 days.',
  '访问密码需要 SoloDrop Pro。':'Password protection requires SoloDrop Pro.',
  '访问密码请使用 8–128 个字符。':'Use 8–128 characters for the access password.',
  '移除品牌需要 SoloDrop Pro。':'Removing branding requires SoloDrop Pro.',
  '有效分享内容已达到套餐容量，请删除不再需要的分享后重试。':'Your active shares have reached your plan capacity. Delete shares you no longer need and try again.',
  '暂时无法确认分享容量，请重试。':'Could not check available capacity. Please try again.',
  '暂时无法生成唯一链接，请重试。':'Could not create a share link. Please try again.',
};

function shareError(message,en) {
  if(!en)return new Error(message);
  const size=message.match(/^当前支持最大 ([\d.]+) MB 的文件。$/);
  return new Error(english[message] || (size?`Your plan supports files up to ${size[1]} MB.`:'Could not create the share. Please try again.'));
}

export {shareError};
