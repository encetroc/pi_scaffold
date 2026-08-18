//! Minimal Bevy 0.19 demo: camera2d + a sprite you can move + a text label.
//!
//! Proves the toolchain end to end on first run — no assets required.
//! The window title is substituted from the wizard's answer at scaffold time.

use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "{{window_title}}".to_string(),
                ..default()
            }),
            ..default()
        }))
        .add_systems(Startup, setup)
        .add_systems(Update, move_sprite)
        .run();
}

/// The player sprite.
#[derive(Component)]
struct Player;

fn setup(mut commands: Commands) {
    // 2D camera.
    commands.spawn(Camera2d);

    // A colored square, moved with the arrow keys.
    commands.spawn((
        Sprite {
            color: Color::srgb(0.3, 0.7, 1.0),
            custom_size: Some(Vec2::splat(96.0)),
            ..default()
        },
        Transform::from_xyz(0.0, 0.0, 0.0),
        Player,
    ));

    // Text label above the sprite.
    commands.spawn((
        Text2d::new("Arrow keys move the sprite"),
        TextFont {
            font_size: FontSize::Px(36.0),
            ..default()
        },
        TextColor(Color::WHITE),
        Transform::from_xyz(0.0, 150.0, 1.0),
    ));
}

fn move_sprite(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut Transform, With<Player>>,
) {
    let mut dir = Vec2::ZERO;
    if keys.pressed(KeyCode::ArrowLeft) {
        dir.x -= 1.0;
    }
    if keys.pressed(KeyCode::ArrowRight) {
        dir.x += 1.0;
    }
    if keys.pressed(KeyCode::ArrowUp) {
        dir.y += 1.0;
    }
    if keys.pressed(KeyCode::ArrowDown) {
        dir.y -= 1.0;
    }
    if dir == Vec2::ZERO {
        return;
    }
    let speed = 320.0 * time.delta_secs();
    for mut transform in &mut query {
        transform.translation.x += dir.x * speed;
        transform.translation.y += dir.y * speed;
    }
}
