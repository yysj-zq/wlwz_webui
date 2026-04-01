from app.api.schemas import MessageIn
from app.services.chat_service import preprocess_messages


def test_preprocess_messages_builds_expected_dialogue() -> None:
    messages = [
        MessageIn(role="郭芙蓉", content="排山倒海！"),
        MessageIn(role="佟湘玉", content="额滴神啊。"),
        MessageIn(role="郭芙蓉", content="掌柜的别激动。"),
    ]

    processed = preprocess_messages(messages, user_role="郭芙蓉", assistant_role="佟湘玉")

    assert processed[0]["role"] == "system"
    assert "佟湘玉" in processed[0]["content"]
    assert processed[1] == {"role": "user", "content": "郭芙蓉：排山倒海！"}
    assert processed[2] == {"role": "assistant", "content": "佟湘玉：额滴神啊。"}
    assert processed[3] == {"role": "user", "content": "郭芙蓉：掌柜的别激动。"}
