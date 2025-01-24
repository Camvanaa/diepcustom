import Bullet from "./Bullet";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { StyleFlags, Color, Stat } from "../../../Const/Enums";
import LivingEntity from "../../Live";
import { PhysicsFlags } from "../../../Const/Enums";
import { EntityStateFlags } from "../../../Native/Entity";

class PoisonEffect {
    private target!: LivingEntity;
    private endTick!: number;
    private damage!: number;
    private game!: any;
    private source!: Poison;
    private interval!: NodeJS.Timeout;

    // 用于追踪每个子弹对目标的毒效果
    private static activeEffects = new Map<LivingEntity, Set<Poison>>();

    constructor(target: LivingEntity, endTick: number, damage: number, source: Poison) {
        // 检查这颗子弹是否已经对目标造成过毒效果
        let targetEffects = PoisonEffect.activeEffects.get(target);
        if (targetEffects?.has(source)) {
            return;
        }

        // 记录这个子弹对目标的毒效果
        if (!targetEffects) {
            targetEffects = new Set();
            PoisonEffect.activeEffects.set(target, targetEffects);
        }
        targetEffects.add(source);

        this.target = target;
        this.endTick = endTick;
        this.damage = damage;
        this.game = target.game;
        this.source = source;

        this.interval = setInterval(() => {
            if (this.target.hash === 0 || this.game.tick >= this.endTick) {
                clearInterval(this.interval);
                // 清理记录
                const effects = PoisonEffect.activeEffects.get(this.target);
                effects?.delete(this.source);
                if (effects?.size === 0) {
                    PoisonEffect.activeEffects.delete(this.target);
                }
                return;
            }

            if (this.target.healthData && this.target.healthData.values.health > 0) {
                this.target.healthData.values.health -= this.damage;
                
                if (this.target.healthData.values.health <= 0) {
                    this.target.destroy(true);
                    clearInterval(this.interval);
                    PoisonEffect.activeEffects.delete(this.target);
                    
                    if (this.target.hash !== 0) {
                        this.source.onKill(this.target);
                    }
                }
            }
        }, 1000/60);
    }
}

/**
 * 毒液子弹类，可以让敌人持续掉血
 */
export default class Poison extends Bullet {
    /** 每tick的中毒伤害 */
    private poisonDamage: number;
    
    /** 中毒持续时间 */
    private poisonDuration: number;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);
        
        const bulletDamage = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletDamage] || 0;
        const bulletHealth = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletPenetration] || 0;
        
        this.poisonDamage = (barrel.definition.bullet.poisonDamage || 0.1) * (1 + bulletDamage * 0.42857);
        this.poisonDuration = (barrel.definition.bullet.poisonDuration || 20) * (1 + bulletHealth * 0.75);
        
        // 设置毒液子弹的颜色为绿色
        this.styleData.values.color = Color.Shiny;
        this.styleData.values.flags |= StyleFlags.hasNoDmgIndicator;
    }

    public tick(tick: number): void {
        super.tick(tick);

        // 检查碰撞
        const collidedEntity = this.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision ? null : this.findCollisions()[0];
        if (collidedEntity instanceof LivingEntity && collidedEntity.healthData) {
            new PoisonEffect(collidedEntity, this.game.tick + this.poisonDuration, this.poisonDamage, this);
        }

        if (tick - this.spawnTick >= this.lifeLength) this.destroy(true);
        // TODO(ABC):
        // This code will be reimplemented in the update that allows for easy camera entity switches
        if ((this.relationsData.values.team?.entityState || 0) & EntityStateFlags.needsDelete) this.relationsData.values.team = null
    }

} 