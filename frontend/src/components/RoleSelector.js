
import { useState, useRef, useEffect } from "react";
import { Box, Fade } from "@mui/material";
import {
  CircleContainer,
  CenterAvatar,
  CenterRoleInfo,
  OuterRoleOption,
  OuterAvatar,
  RoleLabel,
  CenterRoleName,
  CenterRoleDescription,
  CurrentAvatarContainer,
  CurrentAvatar,
  SelectorContainer,
} from "./styles/RoleSelectorStyles";

// 角色数据配置
export const assistantRoles = [
  { name: "佟湘玉", avatar: "/avatars/tongxiangyu.webp", description: "掌柜" },
  { name: "白展堂", avatar: "/avatars/baizhantang.webp", description: "跑堂" },
  { name: "郭芙蓉", avatar: "/avatars/guofurong.webp", description: "杂役" },
  { name: "李大嘴", avatar: "/avatars/lidazui.webp", description: "厨子" },
  { name: "吕秀才", avatar: "/avatars/lvxiucai.webp", description: "账房先生" },
  { name: "莫小贝", avatar: "/avatars/moxiaobei.webp", description: "掌柜小姑子" },
  { name: "燕小六", avatar: "/avatars/yanxiaoliu.webp", description: "六扇门捕头" },
  { name: "祝无双", avatar: "/avatars/zhuwushuang.webp", description: "六扇门捕快" },
  { name: "邢育森", avatar: "/avatars/xingyusen.webp", description: "六扇门捕头" }
];

// 圆形角色选择器组件
export const CircleRoleSelector = ({ selectedRole, onRoleSelect, open, onClose }) => {
  const [hoveredRole, setHoveredRole] = useState(null);
  const containerRef = useRef(null);

  // 处理失焦
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (open) {
      // 延迟添加事件监听器，避免立即触发
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open, onClose]);

  // 获取当前选中角色的信息
  const selectedRoleInfo = assistantRoles.find(role => role.name === selectedRole) || assistantRoles[0];

  // 获取要在中心显示的角色信息（悬停的角色或选中的角色）
  const centerDisplayRole = hoveredRole
    ? assistantRoles.find(role => role.name === hoveredRole) || selectedRoleInfo
    : selectedRoleInfo;

  // 计算每个角色在圆周上的位置
  const getPosition = (index, total, excludeSelected = false) => {
    const radius = 120; // 圆周半径
    const centerX = 150; // 中心X坐标
    const centerY = 150; // 中心Y坐标

    // 如果排除选中的角色，需要调整索引
    let adjustedIndex = index;
    if (excludeSelected) {
      const selectedIndex = assistantRoles.findIndex(role => role.name === selectedRole);
      if (index >= selectedIndex) {
        adjustedIndex = index + 1;
      }
    }

    const angle = (2 * Math.PI / total) * adjustedIndex - Math.PI / 2; // 从顶部开始

    const x = centerX + radius * Math.cos(angle) - 25; // 减去头像宽度的一半
    const y = centerY + radius * Math.sin(angle) - 25; // 减去头像高度的一半

    return { left: x, top: y };
  };

  // 过滤掉当前选中的角色
  const otherRoles = assistantRoles.filter(role => role.name !== selectedRole);

  const handleRoleHover = (roleName) => {
    setHoveredRole(roleName);
  };

  const handleRoleLeave = () => {
    setHoveredRole(null);
  };

  const handleRoleClick = (roleName) => {
    onRoleSelect(roleName);
    setHoveredRole(null);
    onClose();
  };

  return (
    <Fade in={open} timeout={400}>
      <CircleContainer ref={containerRef}>
        {/* 中心显示当前选中的角色或悬停的角色 */}
        <Box sx={{ position: "relative" }}>
          <CenterAvatar
            src={centerDisplayRole.avatar}
            alt={centerDisplayRole.name}
            ishovered={hoveredRole !== null}
          >
            {centerDisplayRole.name.charAt(0)}
          </CenterAvatar>

          <CenterRoleInfo>
            <CenterRoleName ishovered={hoveredRole !== null}>
              {centerDisplayRole.name}
            </CenterRoleName>

            <CenterRoleDescription ishovered={hoveredRole !== null}>
              {centerDisplayRole.description}
            </CenterRoleDescription>
          </CenterRoleInfo>
        </Box>

        {/* 外围显示其他角色 */}
        {otherRoles.map((role, index) => {
          const position = getPosition(index, assistantRoles.length, true);
          const isHovered = hoveredRole === role.name;

          return (
            <OuterRoleOption
              key={role.name}
              className="outer-role-option"
              style={position}
              onMouseEnter={() => handleRoleHover(role.name)}
              onMouseLeave={handleRoleLeave}
              onClick={() => handleRoleClick(role.name)}
            >
              <OuterAvatar
                src={role.avatar}
                alt={role.name}
                isselected={false}
                ishovered={isHovered}
              >
                {role.name.charAt(0)}
              </OuterAvatar>
              <RoleLabel>
                {role.name}
              </RoleLabel>
            </OuterRoleOption>
          );
        })}
      </CircleContainer>
    </Fade>
  );
};

// 角色选择器容器组件
export const RoleSelector = ({ assistantRole, setAssistantRole, position = 'bottom' }) => {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState(null);

  // 获取当前选中角色的信息
  const selectedRoleInfo = assistantRoles.find(role => role.name === assistantRole) || assistantRoles[0];

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setSelectorOpen(true);
    }, 300); // 增加延迟时间，防止误触发
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setSelectorOpen(false);
    }, 300); // 增加延迟时间，给用户更多时间移动鼠标到轮盘
    setHoverTimeout(timeout);
  };

  const handleSelectorMouseEnter = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
  };

  const handleSelectorMouseLeave = () => {
    setSelectorOpen(false);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        mr: 2,
        position: "relative",
        zIndex: 1000
      }}
    >
      {/* 当前头像和当前角色 */}
      <CurrentAvatarContainer
        isselectoropen={selectorOpen}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 当前头像 */}
        <CurrentAvatar
          src={selectedRoleInfo.avatar}
          alt={selectedRoleInfo.name}
          isselectoropen={selectorOpen}
        >
          {selectedRoleInfo.name.charAt(0)}
        </CurrentAvatar>
        {/* 当前角色 */}
        <Box>
          <Box sx={{ fontWeight: 600, lineHeight: 1.2, fontSize: "0.875rem" }}>
            {selectedRoleInfo.name}
          </Box>
          <Box sx={{ color: "text.secondary", lineHeight: 1, fontSize: "0.75rem" }}>
            {selectedRoleInfo.description}
          </Box>
        </Box>
      </CurrentAvatarContainer>

      {/* 轮盘 */}
      <SelectorContainer
        isselectoropen={selectorOpen}
        onMouseEnter={handleSelectorMouseEnter}
        onMouseLeave={handleSelectorMouseLeave}
        position={position}
      >
        <CircleRoleSelector
          selectedRole={assistantRole}
          onRoleSelect={setAssistantRole}
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
        />
      </SelectorContainer>
    </Box>
  );
};

export default RoleSelector;
