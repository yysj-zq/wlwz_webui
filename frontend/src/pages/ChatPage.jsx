import React from 'react';
import { Box } from '@mui/material';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';

const ChatPage = ({
  sidebarOpen,
  isMobile,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onUpdateTitle,
  conversation,
  onSendMessage,
  onPlayMessageAudio,
  onRetryMessageAudio,
  userRole,
  assistantRole,
  setUserRole,
  rolesConfig,
}) => {
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {sidebarOpen || isMobile ? (
        <Sidebar
          open={sidebarOpen}
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onNewChat={onNewChat}
          onDeleteConversation={onDeleteConversation}
          onUpdateTitle={onUpdateTitle}
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
        sidebarOpen={sidebarOpen}
        rolesConfig={rolesConfig}
      />
    </Box>
  );
};

export default ChatPage;
