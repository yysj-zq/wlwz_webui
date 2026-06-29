from app.core.llm import strip_think


def test_strip_think_removes_reasoning_block() -> None:
    raw = "<think>The user wants a summary.\nLet me write it.</think>\n\n玩家推开同福客栈大门，午后阳光斜照。"
    assert strip_think(raw) == "玩家推开同福客栈大门，午后阳光斜照。"


def test_strip_think_keeps_text_without_think() -> None:
    assert strip_think("没有思考标签的纯摘要") == "没有思考标签的纯摘要"
