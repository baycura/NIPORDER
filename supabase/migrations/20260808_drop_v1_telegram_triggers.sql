-- v1 bildirim tetikleyicileri v2 ile cakisiyordu (cift bildirim) -> kaldir
drop trigger if exists t_item_ready on public.order_items;
drop trigger if exists t_item_sent_to_kitchen on public.order_items;