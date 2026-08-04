class ServerStatus {
  final bool running;
  final int pid;
  final double uptimeSeconds;
  final int players;
  final int maxPlayers;
  final int memoryMb;
  final double cpuPercent;
  final int fps;

  ServerStatus({
    required this.running,
    required this.pid,
    required this.uptimeSeconds,
    required this.players,
    required this.maxPlayers,
    required this.memoryMb,
    required this.cpuPercent,
    required this.fps,
  });

  factory ServerStatus.fromJson(Map<String, dynamic> json) {
    return ServerStatus(
      running: json['running'] == true,
      pid: (json['pid'] as num?)?.toInt() ?? 0,
      uptimeSeconds: (json['uptimeSeconds'] as num?)?.toDouble() ?? 0,
      players: (json['players'] as num?)?.toInt() ?? 0,
      maxPlayers: (json['maxPlayers'] as num?)?.toInt() ?? 0,
      memoryMb: (json['memoryMb'] as num?)?.toInt() ?? 0,
      cpuPercent: (json['cpuPercent'] as num?)?.toDouble() ?? 0,
      fps: (json['fps'] as num?)?.toInt() ?? 0,
    );
  }

  String get uptimeText {
    final s = uptimeSeconds.round();
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final sec = s % 60;
    if (h > 0) return '$hч $mм';
    if (m > 0) return '$mм $secс';
    return '$secс';
  }
}

class OnlinePlayer {
  final String steamId;
  final String name;
  final String? connectedAt;
  final int duration;
  final String? location;
  final num? fame;
  final num? balance;
  final num? gold;

  OnlinePlayer({
    required this.steamId,
    required this.name,
    this.connectedAt,
    required this.duration,
    this.location,
    this.fame,
    this.balance,
    this.gold,
  });

  factory OnlinePlayer.fromJson(Map<String, dynamic> json) {
    return OnlinePlayer(
      steamId: json['steamId']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      connectedAt: json['connectedAt']?.toString(),
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      location: json['location']?.toString(),
      fame: json['fame'] as num?,
      balance: json['balance'] as num?,
      gold: json['gold'] as num?,
    );
  }
}

class ChatMessage {
  final String steamId;
  final String playerName;
  final String channel;
  final String message;
  final DateTime? timestamp;

  ChatMessage({
    required this.steamId,
    required this.playerName,
    required this.channel,
    required this.message,
    this.timestamp,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      steamId: json['steamId']?.toString() ?? '',
      playerName: json['playerName']?.toString() ?? '',
      channel: json['channel']?.toString() ?? '',
      message: json['message']?.toString() ?? '',
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString())
          : null,
    );
  }
}

class GameItem {
  final String id;
  final String name;
  final String? description;
  final String? category;
  final String? imageUrl;

  GameItem({
    required this.id,
    required this.name,
    this.description,
    this.category,
    this.imageUrl,
  });

  factory GameItem.fromJson(Map<String, dynamic> json) {
    return GameItem(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      imageUrl: json['imageUrl']?.toString(),
    );
  }
}

class PackConfig {
  final String name;
  final int cooldown;
  final bool enabled;
  final List<PackItem> items;

  PackConfig({
    required this.name,
    required this.cooldown,
    required this.enabled,
    required this.items,
  });

  factory PackConfig.fromJson(Map<String, dynamic> json) {
    final items = <PackItem>[];
    if (json['items'] is List) {
      for (final it in json['items'] as List) {
        items.add(PackItem.fromJson(it as Map<String, dynamic>));
      }
    }
    return PackConfig(
      name: json['name']?.toString() ?? '',
      cooldown: (json['cooldown'] as num?)?.toInt() ?? 0,
      enabled: json['enabled'] == true,
      items: items,
    );
  }
}

class PackItem {
  final String itemId;
  final int amount;

  PackItem({required this.itemId, required this.amount});

  factory PackItem.fromJson(Map<String, dynamic> json) {
    return PackItem(
      itemId: json['itemId']?.toString() ?? json['id']?.toString() ?? '',
      amount: (json['amount'] as num?)?.toInt() ?? 1,
    );
  }
}

class ApiResult {
  final bool ok;
  final String? error;
  final Map<String, dynamic>? data;

  ApiResult({required this.ok, this.error, this.data});

  factory ApiResult.fromResponse(Map<String, dynamic> json) {
    if (json.containsKey('error')) {
      return ApiResult(ok: false, error: json['error']?.toString());
    }
    return ApiResult(ok: true, data: json);
  }
}
