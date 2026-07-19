// Default OAuth scopes for the "Instagram API with Instagram Login" flow.
// These are the Instagram Business scopes — NOT the old Facebook-Login scopes
// (pages_show_list, instagram_basic, etc.), which are invalid on the
// instagram.com authorize endpoint. Override the list with META_OAUTH_SCOPES.
export const DEFAULT_META_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');
