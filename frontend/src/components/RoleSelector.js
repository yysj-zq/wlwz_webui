
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

// 兜底：API 未返回时使用空数组，由父组件传入 roleList
const DEFAULT_POOL = [];

// 圆形角色选择器组件
export const CircleRoleSelector = ({ selectedRole, onRoleSelect, open, onClose, roleList = DEFAULT_POOL }) => {
  const [hoveredRole, setHoveredRole] = useState(null);
  const containerRef = useRef(null);
  const list = roleList?.length ? roleList : DEFAULT_POOL;

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
  const selectedRoleInfo = list.find(role => role.name === selectedRole) || list[0] || { name: selectedRole || "角色", avatar: "", description: "" };

  // 获取要在中心显示的角色信息（悬停的角色或选中的角色）
  const centerDisplayRole = hoveredRole
    ? (list.find(role => role.name === hoveredRole) || selectedRoleInfo)
    : selectedRoleInfo;

  // 计算每个角色在圆周上的位置
  const getPosition = (index, total, excludeSelected = false) => {
    const radius = 120; // 圆周半径
    const centerX = 150; // 中心X坐标
    const centerY = 150; // 中心Y坐标

    // 如果排除选中的角色，需要调整索引
    let adjustedIndex = index;
    if (excludeSelected) {
      const selectedIndex = list.findIndex(role => role.name === selectedRole);
      if (selectedIndex >= 0 && index >= selectedIndex) {
        adjustedIndex = index + 1;
      }
    }

    const angle = (2 * Math.PI / total) * adjustedIndex - Math.PI / 2; // 从顶部开始

    const x = centerX + radius * Math.cos(angle) - 25; // 减去头像宽度的一半
    const y = centerY + radius * Math.sin(angle) - 25; // 减去头像高度的一半

    return { left: x, top: y };
  };

  // 过滤掉当前选中的角色
  const otherRoles = list.filter(role => role.name !== selectedRole);

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
            src={centerDisplayRole.avatar || undefined}
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
          const position = getPosition(index, list.length, true);
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
                src={role.avatar || undefined}
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
export const RoleSelector = ({ assistantRole, setAssistantRole, position = 'bottom', roleList = DEFAULT_POOL }) => {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState(null);
  const list = roleList?.length ? roleList : DEFAULT_POOL;

  // 获取当前选中角色的信息
  const selectedRoleInfo = list.find(role => role.name === assistantRole) || list[0] || { name: assistantRole || "角色", avatar: "", description: "" };

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
          roleList={roleList}
        />
      </SelectorContainer>
    </Box>
  );
};

export default RoleSelector;
