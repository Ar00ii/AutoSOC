import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from .scoping import event_passes


@dataclass
class Subscriber:
    queue: asyncio.Queue
    principal: dict = field(default_factory=dict)


_subscribers: set[Subscriber] = set()


async def subscribe(principal: dict | None = None) -> Subscriber:
    sub = Subscriber(queue=asyncio.Queue(maxsize=200), principal=principal or {})
    _subscribers.add(sub)
    return sub


def unsubscribe(sub: Subscriber) -> None:
    _subscribers.discard(sub)


def publish(event_type: str, data: Any) -> None:
    payload = json.dumps({"type": event_type, "data": data}, default=str)
    dead: list[Subscriber] = []
    for sub in _subscribers:
        if event_type == "event" and isinstance(data, dict):
            if not event_passes(sub.principal, data):
                continue
        try:
            sub.queue.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(sub)
    for sub in dead:
        _subscribers.discard(sub)
