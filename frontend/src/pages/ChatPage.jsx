import React from 'react';
import { Box } from '@mui/material';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';

const ChatPage = ({
  sidebarOpen,
  isMobile,
  zenMode,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onUpdateTitle,
  onCloseSidebar,
  conversation,
  onSendMessage,
  onPlayMessageAudio,
  onRetryMessageAudio,
  userRole,
  assistantRole,
  setUserRole,
  setAssistantRole,
  rolesConfig,
  onZenActivate,
  onTopbarCondenseChange,
}) => {
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
      {sidebarOpen ? (
        <Sidebar
          open={sidebarOpen}
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onNewChat={onNewChat}
          onDeleteConversation={onDeleteConversation}
          onUpdateTitle={onUpdateTitle}
          onClose={onCloseSidebar}
          isMobile={isMobile}
        />
      ) : null}
      <Chat
        conversation={conversation}
        onSendMessage={onSendMessage}
        onPlayMessageAudio={onPlayMessageAudio}
        onRetryMessageAudio={onRetryMessageAudio}
        userRole={userRole}
        assistantRole={assistantRole}
        setUserRole={setUserRole}
        setAssistantRole={setAssistantRole}
        sidebarOpen={sidebarOpen}
        rolesConfig={rolesConfig}
        zenMode={zenMode}
        onZenActivate={onZenActivate}
        onTopbarCondenseChange={onTopbarCondenseChange}
      />
    </Box>
  );
};

export default ChatPage;
